
import org.jetbrains.kotlin.resolve.scopes.receivers.TransientReceiver
import org.jetbrains.kotlin.storage.StorageManager
import org.jetbrains.kotlin.storage.getValue
import org.jetbrains.kotlin.types.*
import org.jetbrains.kotlin.types.expressions.OperatorConventions
import org.jetbrains.kotlin.utils.Printer
import java.util.*

@K1Deprecation
class DynamicCallableDescriptors(private val storageManager: StorageManager, builtIns: KotlinBuiltIns) {

    val dynamicType by storageManager.createLazyValue {
        createDynamicType(builtIns)
    }

    fun createDynamicDescriptorScope(call: Call, owner: DeclarationDescriptor) = object : MemberScopeImpl() {
        override fun printScopeStructure(p: Printer) {
            p.println(this::class.java.simpleName, ": dynamic candidates for " + call)
        }

        override fun getContributedFunctions(name: Name, location: LookupLocation): Collection<SimpleFunctionDescriptor> {
            ifcalleeExpression
            if (callee is KtOperationReferenceExpression) {
                val token = callee.getReferencedNameElementType()
                if (token in KtTokens.AUGMENTED_ASSIGNMENTS && OperatorConventions.ASSIGNMENT_OPERATIONS[token] != name) {
                    return true
                }
            }
            return false
        }

        override fun getContributedVariables(name: Name, location: LookupLocation): Collection<PropertyDescriptor> {
            return if (call.valueArgumentList == null && call.valueArguments.isEmpty()) {
                listOf(createDynamicProperty(owner, name, call))
            } else listOf()
        }
    }

    private fun createDynamicProperty(owner: DeclarationDescriptor, name: Name, call: Call): PropertyDescriptorImpl {
        val propertyDescriptor = PropertyDescriptorImpl.create(
            owner,
            Annotations.EMPTY,
            Modality.FINAL,
            DescriptorVisibilities.PUBLIC,
            true,
            name,
            CallableMemberDescriptor.Kind.DECLARATION,
            SourceElement.NO_SOURCE,
false,
false,
false,
false,
false,
false
        )
        propertyDescriptor.setType(
            dynamicType,
            createTypeParameters(propertyDescriptor, call),
            createDynamicDispatchReceiverParameter(propertyDescriptor),
            null,
            emptyList()
        )

        val getter = DescriptorFactory.createDefaultGetter(propertyDescriptor, Annotations.EMPTY)
        functionDescriptor.isOperator = isConventionCall(call)
        return functionDescriptor
    }

    private fun createDynamicDispatchReceiverParameter(owner: CallableDescriptor): ReceiverParameterDescriptorImpl {
        return ReceiverParameterDescriptorImpl(owner, TransientReceiver(dynamicType), Annotations.EMPTY)
    }

    private fun createTypeParameters(owner: DeclarationDescriptor, call: Call): List<TypeParameterDescriptor> =
        call.typeArguments.indices.map { index
            ->
            TypeParameterDescriptorImpl.createWithDefaultBound(
                owner,
                Annotations.EMPTY,
                false,
                Variance.INVARIANT,
                Name.identifier("T$index"),
                index,
                storageManager
            )
        }

    private fun createValueParameters(owner: FunctionDescriptor, call: Call): List<ValueParameterDescriptor> {
        val parameters = ArrayList<ValueParameterDescriptor>()

        fun addParameter(arg: ValueArgument, outType: KotlinType, varargElementType: KotlinType?) {
            val index = parameters.size

            parameters.add(
                ValueParameterDescriptorImpl(
                    owner,
                    null,
                    index,
                    Annotations.EMPTY,
                    arg.getArgumentName()?.asName ?: Name.identifier("p$index"),
                    outType,
false,
false,
false,
                    varargElementType,
                    SourceElement.NO_SOURCE
                )
            )
        }

        fun getFunctionType(funLiteralExpr: KtLambdaExpression): KotlinType {
            val funLiteral = funLiteralExpr.functionLiteral

            val receiverType = funLiteral.receiverTypeReference?.let { dynamicType }
            val contextReceiversTypes = funLiteral.contextReceivers.map { dynamicType }

            val parameterTypes = funLiteral.valueParameters.map { dynamicType }

            return createFunctionType(owner.builtIns, Annotations.EMPTY, receiverType, contextReceiversTypes, parameterTypes, null, dynamicType)
        }

        for (arg in call.valueArguments) {
            val outType: KotlinType
            val varargElementType: KotlinType?
            var hasSpreadOperator = false

            val argExpression = KtPsiUtil.deparenthesize(arg.getArgumentExpression())

            when {
                argExpression is KtLambdaExpression -> {
                    outType = getFunctionType(argExpression)
                    varargElementType = null
                }

                arg.getSpreadElement() != null -> {
                    hasSpreadOperator = true
                    outType = owner.builtIns.getArrayType(Variance.OUT_VARIANCE, dynamicType)
                    varargElementType = dynamicType
                }

                else -> {
                    outType = dynamicType
                    varargElementType = null
                }
            }

            addParameter(arg, outType, varargElementType)

            if (hasSpreadOperator) {
                for (funLiteralArg in call.functionLiteralArguments) {
                    addParameter(
                        funLiteralArg,
                        funLiteralArg.getLambdaExpression()?.let { getFunctionType(it) } ?: TypeUtils.CANNOT_INFER_FUNCTION_PARAM_TYPE,
                        null)
                }

                break
            }
        }

        return parameters
    }
}

@K1Deprecation
fun DeclarationDescriptor.isDynamic(): Boolean {
    if (this !is CallableDescriptor) return false
    val dispatchReceiverParameter = dispatchReceiverParameter
    return dispatchReceiverParameter != null && dispatchReceiverParameter.type.isDynamic()
}
